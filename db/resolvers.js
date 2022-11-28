const Usuario = require('../models/Usuario');
const Producto = require('../models/Producto');
const Cliente = require('../models/Cliente');
const Pedido = require('../models/Pedido');

const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken')
require('dotenv').config({ path: 'variables.env' })

const crearToken = (usuario, secreta, expiresIn) => {
    // console.log(usuario);
    const { _id, email, nombre, apellido} = usuario;
    return jwt.sign({ id:_id, email, nombre, apellido }, secreta, { expiresIn })
}
 
// resolvers
const resolvers = {
    Query: {
        obtenerUsuario: async (_, {}, ctx) => {
            return ctx.usuario;
        },
        obtenerProductos: async () => {
            try {
                const productos = await Producto.find({});
                return productos; 
            } catch (error) {
                console.log(error)
            }
        },
        obtenerProducto: async (_, { id }) => {
            // revisar si el producto existe
            const producto = await Producto.findById(id);
            if (!producto) {
                throw new Error('Producto no encontrado')
            }
            return producto
        },
        obtenerClientes: async () => {
            try {
                const clientes = await Cliente.find({});
                return clientes;
            } catch (error) {
                console.log(error)
            }
        },
        obtenerClientesVendedor: async (_, {}, ctx) => {
            try {
                const clientes = await Cliente.find({ vendedor: ctx.usuario.id.toString()});
                return clientes;
            } catch (error) {
                console.log(error)
            }
        },
        obtenerCliente: async (_, {id}, ctx) => {
            // revisar si el producto existe
            const cliente = await Cliente.findById(id);

            if(!cliente) {
                throw new Error('Cliente no encontrado')
            }
            
            // quien lo creo puede verlo
            if (cliente.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales')
            }
            return cliente;
        },

        //Pedidos
        obtenerPedidos: async () => {
            try {
                const pedidos = await Pedido.find({})
                return pedidos
            } catch (error) {
                console.log(error)
            }
        },
        obtenerPedidosVendedor: async (_, {}, ctx) => {
            try {
                const pedidos = await Pedido.find({vendedor: ctx.usuario.id}).populate('cliente')
                // console.log(pedidos)
                return pedidos
            } catch (error) {
                console.log(error)
            }
        },
        obtenerPedido: async (_, {id}, ctx) => {
            
            const pedido = await Pedido.findById(id);

            if (!pedido) {
                throw new Error('Pedido no encontrado')
            }
            // quien lo creo puede verlo
            if (pedido.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales')
            }
            return pedido
        },
        obtenerPedidoEstado: async (_, {estado}, ctx) => {
            const pedidos = await Pedido.find({ vendedor: ctx.usuario.id, estado})
            return pedidos
        },

        mejoresClientes: async () => {
            const clientes = await Pedido.aggregate([
                { $match: {estado: "COMPLETADO"} },
                { $group: {
                    _id: "$cliente",
                    total: { $sum: '$total'}
                }},
                {
                    $lookup: {
                        from: 'clientes',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'cliente'
                    }
                },
                {
                    $limit: 10
                },
                {
                    $sort: { total: -1}
                }
            ])
            return clientes
        },
        mejoresVendedores: async () => {
            const vendedores = await Pedido.aggregate([
                { $match: { estado: "COMPLETADO"}},
                { $group: {
                    _id: '$vendedor',
                    total: {$sum: '$total'}
                }},
                {
                    $lookup: {
                        from: 'usuarios',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'vendedor'
                    }
                },
                {
                    $limit: 3
                },
                {
                    $sort: { total: -1}
                }
            ])
            return vendedores
        },
        buscarProducto: async (_, { texto }) => {
            const productos = await Producto.find({$text: { $search: texto}}).limit(10)
            return productos;
        }
    },
    Mutation: {
        nuevoUsuario: async (_, {input}) => {
            const { email, password } = input;

            // revisar si el usuario ya esta registrado
            const existeUsuario = await Usuario.findOne({email});
            if (existeUsuario) {
                throw new Error('El usuario ya esta registrado')
            }

            // Hashear su password
            const salt = await bcryptjs.genSaltSync(10);
            input.password = await bcryptjs.hashSync(password, salt);

            //Guardarlo en la base de datos
            try {
                const usuario = new Usuario(input);
                usuario.save();
                return usuario;
            } catch (error) {
                console.log(error)
            }
        },
        autenticarUsuario: async (_, {input}) => {
            const {email, password } = input;
            
            // si el usuario existe
            const existeUsuario = await Usuario.findOne({email});
            if (!existeUsuario) {
                throw new Error('El usuario no esta registrado')
            }

            // Revisar si el pasword es correcto
            const passwordCorrecto = await bcryptjs.compare(password, existeUsuario.password)
            if(!passwordCorrecto) {
                throw new Error('el password es incorrecto');
            }

            // Crear el token
            return {
                token: crearToken(existeUsuario, process.env.SECRETA, '24h')
            }
        },

        // Productos
        nuevoProducto: async (_, {input}) => {
            try {
                const producto = new Producto(input)

                //almacenar en la bd
                const resultado = await producto.save();
                return resultado
            } catch (error) {
                console.log(error)
            }
        },
        actualizarProducto: async (_, {id, input}) => {
            // revisar si el producto existe
            let producto = await Producto.findById(id);
            if (!producto) {
                throw new Error('Producto no encontrado')
            }

            // guardarlo en la base de datos
            producto = await Producto.findOneAndUpdate({_id: id}, input, {new: true});

            return producto;
        },
        eliminarProducto: async (_, {id}) => {
            // revisar si el producto existe
            let producto = await Producto.findById(id);
            if (!producto) {
                throw new Error('Producto no encontrado')
            }

            // Eliminar
            await Producto.findOneAndDelete({_id: id});

            return 'Producto eliminado';
        },

        // Clientes
        nuevoCliente: async (_, {input}, ctx ) => {
            const { email } = input;

            //Verificar si el cliente ya esta registardo
            const cliente = await Cliente.findOne({ email });
            if (cliente) {
                throw new Error('Ya se encuentra registrado')
            }

            const nuevoCliente = new Cliente(input)

            // asignar al vendedor
            nuevoCliente.vendedor = ctx.usuario.id;

            //guardarlo en la base de datos
            try {
                const resultado = await nuevoCliente.save();
                return resultado;
            } catch (error) {
                console.log(error)
            }
        },
        actualizarCliente: async (_, {id, input}, ctx) => {
            // revisar si el cliente existe
            let cliente = await Cliente.findById(id);
            if (!cliente) {
                throw new Error('Cliente no encontrado')
            }
            
            //Verificar si el cliente es de quien edita
            if (cliente.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales')
            }
            // guardarlo en la base de datos
            cliente = await Cliente.findOneAndUpdate({_id: id}, input, {new: true});

            return cliente;
        },
        eliminarCliente: async (_, {id}, ctx) => {
            // revisar si el cliente existe
            let cliente = await Cliente.findById(id);
            if (!cliente) {
                throw new Error('Cliente no encontrado')
            }
            
            //Verificar si el cliente es de quien edita
            if (cliente.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales')
            }
            // guardarlo en la base de datos
            cliente = await Cliente.findOneAndDelete({_id: id});

            return "Cliente eliminado";
        },
        //Pedidos
        nuevoPedido: async (_, {input}, ctx) => {
            const { cliente } = input;

            // Verificar si el cliente existe
            let clienteExiste = await Cliente.findById(cliente);
            if (!clienteExiste) {
                throw new Error('Cliente no encontrado')
            } 

            // Verificar si el cliente es del vendedor
            if (clienteExiste.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales')
            }

            // Revisar que el stock este disponible
            for await ( const articulo of input.pedido){ 
                const { id } = articulo;
                const producto = await Producto.findById(id);
                if (articulo.cantidad > producto.existencia) {
                    throw new Error(`El articulo: ${producto.nombre} excede la cantidad disponible`)
                }else {
                    //restar cantidad a los disponibles
                    producto.existencia = producto.existencia - articulo.cantidad;
                    await producto.save();
                }
            };

            // Crear un nuevo pedido
            const nuevoPedido = new Pedido(input);

            // Asignarle un vendedor
            nuevoPedido.vendedor = ctx.usuario.id;

            // Guardar en la DB
            const resultado = await nuevoPedido.save();
            return resultado;
        },
        actualizarPedido: async (_, {id, input}, ctx) => {
            const { cliente } = input;

            // Si el pedido existe
            const existePedido = await Pedido.findById(id)
            if (!existePedido) {
                throw new Error('Pedido no encontrado')
            } 

            // Verificar si el cliente existe
            let clienteExiste = await Cliente.findById(cliente);
            if (!clienteExiste) {
                throw new Error('Cliente no encontrado')
            } 

            // Verificar si el cliente es del vendedor
            if (clienteExiste.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales')
            }

            // Revisar que el stock este disponible
            if(input.pedido){
                for await ( const articulo of input.pedido){ 
                    const { id } = articulo;
                    const producto = await Producto.findById(id);
                    if (articulo.cantidad > producto.existencia) {
                        throw new Error(`El articulo: ${producto.nombre} excede la cantidad disponible`)
                    }else {
                        //restar cantidad a los disponibles
                        producto.existencia = producto.existencia - articulo.cantidad;
                        await producto.save();
                    }
                };
            }

            // Guardar en la DB
            const resultado = await Pedido.findByIdAndUpdate({_id: id}, input, {new: true});
            return resultado;
        },
        eliminarPedido: async (_, {id}, ctx) => {
            // Verificar si existe pedido
            let pedido = await Pedido.findById(id);

            if(!pedido){
                throw new Error('No se encontro el pedido')
            }
            // Verificar si el pedido es del vendedor
            if(pedido.vendedor.toString() !== ctx.usuario.id){
                throw new Error('No tienes las credenciales')
            }

            pedido = await Pedido.findOneAndDelete({_id: id})

            return 'Pedido eliminado'
        }
    }
}

module.exports = resolvers;